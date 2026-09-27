package com.email.writer.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.email.writer.model.EmailRequest;
import com.email.writer.repository.EmailGenratorRepo;

@Service
public class EmailServiceImpl implements EmailService {
	
	@Autowired
	private EmailGenratorRepo egr;
	public void setEgr(EmailGenratorRepo egr) {
		this.egr = egr;
	}
	
	
	@Override
	public String emailReply(EmailRequest er) {
		return egr.emailReply(er);
	}

}
