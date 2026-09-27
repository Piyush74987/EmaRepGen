package com.email.writer.repository;

import com.email.writer.model.EmailRequest;

public interface EmailGenratorRepo {
	
	public String emailReply(EmailRequest er);

}
